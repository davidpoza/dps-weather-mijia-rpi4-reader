const dotenv = require('dotenv');
dotenv.config();
const Mijia = require('xiaomi-mijia-thermometer');
const fetch = require('node-fetch');

const ALIASES = {
   'a4:c1:38:51:cc:ce': 'BEDROOM',
   'a4:c1:38:ab:74:e8': 'BEDROOM2'
};

const ENDPOINT = process.env.API_ENDPOINT;
const USER = process.env.API_USER;
const PASSWORD = process.env.API_PASSWORD;

console.log("ENDPOINT:", ENDPOINT);

async function login() {
	try {
		console.log("Login on server...");
   	const res = await fetch(`${ENDPOINT}/api/auth/authenticate`, {
  		method: 'POST',
  		headers: {
				Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
	  		email: USER,
        password: PASSWORD,
      })
	  });
   const loginData = await res.json();
	 console.log("login status: ", loginData);
   const { token } = loginData.data;
   return token;
	} catch (Error) {
    console.log("Error during login", Error);
	} 
}

async function uploadData(token, alias, temperature, humidity) {
	try {
		console.log("Uploading data to server...");
   	const res = await fetch(`${ENDPOINT}/api/logging/log`, {
  		method: 'POST',
  		headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
			},
      body: JSON.stringify({
				station_id: alias,
				temperature,
				humidity
      })
	  });
	} catch (Error) {
    console.log("Error during data upload", Error);
	} 

}

// Discover thermometers
const stop = Mijia.discover(async function (device, devices) {
   const alias = device && device.specs && device && device.specs.address && ALIASES[device.specs.address];
   const rssi = device && device.specs && device && device.specs.rssi;
   const id = device && device.specs && device && device.specs.id;
   const address = device && device.specs && device && device.specs.address;

   let count = 0;
   for (let key in devices) {
      const dev = devices[key];
      if (ALIASES[dev && dev.specs && dev.specs.id] || ALIASES[dev && dev.specs && dev.specs.address]) count++;
   }
   const total = Object.keys(ALIASES).length;
   console.log('- Device discovered', alias, address, id, rssi, count + '/' + total);

   //stop when the 3 of them have been found
   if (count >= total) {
      console.log('-> Scanning DONE');
      stop();
      await collectData(devices);
      process.exit();
   }

   //or stop on timeout
}, async function (devices) {
   console.log('-> Sanning TIMEOUT', devices && Object.keys(devices));
   await collectData(devices);
   process.exit();
})

//collect data from found devices
async function collectData(devices) {
   const token = await login();

	 const keys = devices && Object.keys(devices);
   console.log('-> Collecting data...', keys);
   if (!keys || !keys.length) return console.log('- empty devices list');

   const out = {};
   return promiseEach(keys, async function (id) {
      //return Promise.each(keys, async function (id) {
      const alias = id && ALIASES[id];
      console.log('- getting data for', alias, id);
      const data = devices[id] && devices[id].getData && await devices[id].getData();
      console.log('- data received for', alias, id, data);
      data.alias = alias;
      data.id = id;
      out[alias || id] = data;
      if (data && out[alias] && out[alias].values) await uploadData(token, alias, out[alias].values.temperature, out[alias].values.humidity);
		  else console.log(`⚠ Error, no data read from sensor ${alias}`);
   }).then(function () {
      console.log('-> Collecting data DONE');
      console.log(out);
	 })
}

// util: run promises in sequence without heavy bluerbird
async function promiseEach(queue, func) {
   for (const el of queue) {
      await func(el);
   }
};
