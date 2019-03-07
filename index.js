const SLEEPTIME = 3000;

const https = require('https');
const request = require('request');
const port = 3000;

let stdin = process.stdin;
stdin.setEncoding('utf8');
const readline = require('readline');
const prompt = readline.createInterface({
    input: stdin,
    output: process.stdout,
});

/***
 * Reads input from user. Blocking.
 * @param message User prompt
 * @returns {Promise<any>} User input.
 */
function readLineAsync(message) {
    return new Promise((resolve, reject) => {
        prompt.question(message, (answer) => {
            resolve(answer);
        });
    });
}

const fs = require('fs');
const products = './products.json';
let product_list;

let commands = {
    'help': {
        'name' : "help",
        'description' : "Lists available commands.",
        'function' : "printHelp()",
        'aliases' : [
            "help",
            "?",
            "h",
        ],
    },
    'run' : {
        'name' : "run",
        'description' : "Begin running the availability checker.",
        'function' : "",
        'aliases' : [
            "run",
            "start",
            "go",
        ],
    },
    'add' : {
        'name' : "add",
        'description' : "Add a product to the list of checked products.",
        'function' : "",
        'aliases' : [
            "add",
        ],
    },
    'remove' : {
        'name' : "remove",
        'description' : "Remove a product from the list of checked products.",
        'function' : "",
        'aliases' : [
            "remove",
            "delete",
        ],
    },
    'quit' : {
        'name' : "quit",
        'description' : "Exit the program.",
        'function' : "",
        'aliases' : [
            "quit",
            "exit",
            "stop"
        ],
    },
    'list' : {
        'name' : "list",
        'description' : "List all tracked urls",
        'function' : "",
        'aliases' : [],
    },
};

/***
 * Writes product data JSON to products.json
 */
function writeProductData() {
    let pJSON = JSON.stringify(product_list);
    try {
        console.log(">+ Writing to products file");
        fs.writeFile(products, pJSON, (err, result) => {
            if (err) throw new err;
        });
    } catch (err) {
        console.log(">! Error encountered when writing to products file: ");
        console.error(err);
    }
}

/***
 * Prints available commands.
 */
function printHelp() {
    console.log(">+ Available commands: ");
    let keys = Object.keys(commands);
    for (let i = 0; i < keys.length; i++) {
        console.log("+ " + keys[i] + ": " + commands[keys[i]].description);
    }
}

/***
 * Adds a website to the products list for monitoring.
 * @param url Website url
 * @param name Website id
 * @param path Path to shopify JSON
 */
function addSite(url, name, path) {
    if (name === "") {
        product_list[Object.keys(product_list).length + 1] =
            {
                'loc': url,
                'path': path,
                'products': [],
            };
    } else {
        product_list[name] =
            {
                'loc': url,
                'path': path,
                'products': [],
            }
    }
    writeProductData();
}

/***
 * Deletes a website from the products list, so that website will no longer be monitored.
 * @param name ID of the website to be deleted.
 */
function deleteProduct(name) {
    if (name !== "" && product_list.hasOwnProperty(name)) {
        delete product_list[name];
        console.log(">+ No longer tracking site ID '" + name + "'.")
    } else {
        console.log(">! Failed: Products list does not contain '" + name + "'.")
    }
}

/***
 * Lists currently tracked websites.
 */
function listProducts() {
    console.log("Tracked products: ");
    let keys = Object.keys(product_list);
    if (keys.length === 0) {
        console.log("None.");
        return;
    }
    for (let i = 0; i < keys.length; i++) {
        console.log("- " + keys[i] + ": " + product_list[keys[i]].loc);
    }
}

/***
 * Extracts the useful data from the JSON given by a tracked website.
 * @param data JSON to extract from
 * @param id ID of the site this data came from
 * @returns {Array} Returns array of useful data
 */
function parseProductInfo(data, id) {
    if (data === "" || !(product_list.hasOwnProperty(id))) {
        console.log("No data detected for '" + id + "'.");
        return [];
    }

    /*
    * Relevant Data:
    * products[i].id
    * products[i].handle
    * products[i].variants[j].id
    * products[i].variants[j].title
    * products[i].variants[j].available
    * products[i].variants[j].price
     */

    let prods = [];
    data = JSON.parse(data);
    let keys = Object.keys(data.products);
    for (let i = 0; i < keys.length; i++) {
        let variants = [];
        let current = data.products[i];

        for (let j = 0; j < Object.keys(current.variants).length; j++) {
            let cv = current.variants[j];
            variants.push({
                'id': cv.id,
                'title': cv.title,
                'available': cv.available,
                'price': cv.price,
            });
        }

        prods.push({
            'id': current.id,
            'handle': current.handle,
            'variants': variants,
        })
    }

    console.log(">+ Parsed info from " + id);

    return prods;
}

/***
 * Gets raw JSON data from a tracked website.
 * @param url URL to the tracked website
 * @param path Path to the shopify JSON
 * @returns {Promise<any>} String of JSON from the request, or nothing if the request fails.
 */
function getProductData(url, path) {
    return new Promise(resolve => {
        let options = {
            url: "https://" + url + path,
            headers: {
                'User-Agent': 'request'
            }
        };

        request(options, (err, resp, body) => {
            if (err) {
                console.log('>! Error while connecting to ' + options.url + ": " + err.message);
                resolve({})
            }
            console.log('>+ Received data from ' + options.url);
            resolve(body);
        });
    });
}

/***
 * Delays the next iteration of a loop
 * @param ms Time in milliseconds to sleep
 * @returns {Promise<any>} Nothing
 */
function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

/***
 * Main loop for product monitoring. Sends requests to each tracked website, extracts useful data and writes it
 * to the products.json file.
 * @returns {Promise<void>} Nothing
 */
async function run() {
    let cont = true;
    do {
        let keys = Object.keys(product_list);
        for (let i = 0; i < keys.length; i++) {
            let url = product_list[keys[i]].loc;
            let path = product_list[keys[i]].path;

            console.log('Checking ' + keys[i] + ":" + url + path);

            await getProductData(url, path).then(data => {
                product_list[keys[i]].products = parseProductInfo(data, keys[i]);
            });

        }

        writeProductData();
        console.log(">+ Check cycle finished. Waiting " + SLEEPTIME + "ms...");
        await sleep(SLEEPTIME);
    } while (cont);
}

/***
 * Prelude to monitoring loop. Allows user to add or remove tracked websites and list currently tracked websites via
 * specified commands. Valid commands can be listed using the 'help', '?' or 'h' command.
 * @returns {Promise<void>} Nothing
 */
async function getInput() {
    let cont = true;
    do {
        let uin = await readLineAsync(">- ");
        switch (uin) {
            case 'help':
            case '?':
            case 'h':
                await printHelp();
                break;
            case 'add':
                let site = await readLineAsync(">?URL? ");
                site = site.replace(/(^\w+:|^)\/\//, '')
                let path = await readLineAsync(">?PATH? ");
                let name = await readLineAsync(">?ID? ");
                await addSite(site, name, path);
                break;
            case 'delete':
                let delName = await readLineAsync(">?ID? ");
                await deleteProduct(delName);
                break;
            case 'list':
                await listProducts();
                break;
            case 'run':
                await run();
                break;
            case 'quit':
                console.log(">! Exiting.");
                cont = false;
                break;
            default:
                console.log(">! Command not recognized. To see a list of available commands type 'help' or '?'");
        }
    } while (cont);
    process.exit(0);
}

console.log(">+ Shopify-Checker initializing.");

/***
 * Setup before getInput loop. Searches for products.json file. If one is found, read it into product_list. If not,
 * prompt user to create a new empty products.json file. If the user opts not to, exit. Otherwise if a products.json file
 * now exists, continue to the getInput loop.
 * @returns {Promise<void>} Nothing
 */
async function setup() {
    console.log(">+ Looking for products file...");
    try {
        if (fs.existsSync(products)) {
            console.log(">+ Products file found. Reading...");
            fs.readFile(products, 'utf8', (err, data) => {
                if (err) throw err;
                product_list = JSON.parse(data);
            });
            console.log(">+ Products file read. Awaiting input...");
        } else {

            let uin = await readLineAsync('>? No product file detected! Would you like to create a products file? (y/n)');

            if (uin === 'y') {
                console.log(">+ Creating products file...");
                product_list = {

                };
                await writeProductData()
            } else {
                console.log(">! No products data exists. Exiting.");
                process.exit(0);
            }

        }
    } catch (err) {
        console.log(">! Error encountered when reading products file: ");
        console.error(err)
    }
    getInput();
}


// Call setup to begin execution.
setup();



