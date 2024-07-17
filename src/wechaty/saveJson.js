import {fileURLToPath} from "url";

import fs from 'fs';
import path from 'path';

export class DataStore {
    constructor(filename) {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        this.filename = path.join(__dirname, filename);
        this.data = {};
        try {
            this.data = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
        } catch (error) {
            console.log('No data file found, initializing empty data object');
        }
    }

    add(key, value) {
        this.data[key] = value;
        this.save();
    }

    get(key) {
        return this.data[key];
    }

    delete(key) {
        if (this.data[key]) {
            delete this.data[key];
            this.save();
            return true;
        }
        return false;
    }

    save() {
        fs.writeFileSync(this.filename, JSON.stringify(this.data));
    }
}
