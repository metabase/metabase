import fs from "fs-promise";
import os from "os";
import path from "path";
import { spawn } from "child_process";

import fetch from 'isomorphic-fetch';
import { delay } from '../../../src/metabase/lib/promise';

let testDbId = 0;
const getDbFile = () => path.join(os.tmpdir(), `metabase-test-${process.pid}-${testDbId++}.db`);

let port = 4000;
const getPort = () => port++;

const servers = new Map();

class Server {
    constructor(dbKey, dbFile) {
        this.dbKey = dbKey;
        this.dbFile = dbFile;

        this.port = getPort();
        this.host = `http://localhost:${this.port}`;
    }

    async start() {
        if (!this.process) {
            if (this.dbKey !== this.dbFile) {
                await fs.copy(`${this.dbKey}.h2.db`, `${this.dbFile}.h2.db`);
            }
            this.count = 0;
            this.process = spawn("java", ["-jar", "target/uberjar/metabase.jar"], {
                env: {
                    MB_DB_FILE: this.dbFile,
                    MB_JETTY_PORT: this.port
                },
            })
            this.process.on("close", () => {
                this.kill();
            })
        }
        this.count++;
        return this.wait();
    }

    async stop() {
        // timeout allows for another test suite to reuse this server
        setTimeout(() => {
            if (--this.count === 0) {
                this.kill();
            }
        }, 10000)
    }

    async wait() {
        while (!(await isReady(this.host))) {
            await delay(500);
        }
    }

    async kill() {
        if (servers.has(this.dbKey)) {
            servers.delete(this.dbKey);
            this.process.kill('SIGKILL');
            try {
                await fs.unlink(`${this.dbFile}.h2.db`);
            } catch (e) {
                console.log("failed to remove dbFile", this.dbFile, e);
            }
        }
    }
}

export async function startServer(dbKey) {
    let dbFile = getDbFile();
    if (!dbKey) {
        dbKey = dbFile;
    }

    if (!servers.has(dbKey)) {
        servers.set(dbKey, new Server(dbKey, dbFile));
    }
    let server = servers.get(dbKey);

    await server.start();
    return server;
}

export async function isReady(host) {
    try {
        let response = await fetch(`${host}/api/health`);
        if (response.status === 200) {
            return true;
        }
    } catch (e) {
    }
    return false;
}

process.once("exit", () => {
    for (const server of servers) {
        server.kill();
    }
});
