import fs from "fs-promise";
import os from "os";
import path from "path";
import { spawn } from "child_process";

import fetch from 'isomorphic-fetch';
import { delay } from '../../../src/metabase/lib/promise';

import createSharedResource from "./shared-resource";

export const DEFAULT_DB = "frontend/test/e2e/support/fixtures/metabase.db";

let testDbId = 0;
const getDbFile = () => path.join(os.tmpdir(), `metabase-test-${process.pid}-${testDbId++}.db`);

let port = 4000;
const getPort = () => port++;

export const BackendResource = createSharedResource("BackendResource", {
    getKey({ dbKey = DEFAULT_DB }) {
        return dbKey || {}
    },
    create({ dbKey = DEFAULT_DB }) {
        let dbFile = getDbFile();
        if (!dbKey) {
            dbKey = dbFile;
        }
        if (process.env["E2E_HOST"] && dbKey === DEFAULT_DB) {
            return {
                dbKey: dbKey,
                host: process.env["E2E_HOST"],
                process: { kill: () => {} }
            };
        } else {
            let port = getPort();
            return {
                dbKey: dbKey,
                dbFile: dbFile,
                host: `http://localhost:${port}`,
                port: port
            };
        }
    },
    async start(server) {
        if (!server.process) {
            if (server.dbKey !== server.dbFile) {
                await fs.copy(`${server.dbKey}.h2.db`, `${server.dbFile}.h2.db`);
            }
            server.process = spawn("java", ["-jar", "target/uberjar/metabase.jar"], {
                env: {
                    MB_DB_FILE: server.dbFile,
                    MB_JETTY_PORT: server.port
                },
                stdio: "inherit"
            });
        }
        if (!(await isReady(server.host))) {
            process.stdout.write("Waiting for backend (host=" + server.host + " dbKey=" + server.dbKey + ")");
            while (!(await isReady(server.host))) {
                process.stdout.write(".");
                await delay(500);
            }
            process.stdout.write("\n");
        }
        console.log("Backend ready (host=" + server.host + " dbKey=" + server.dbKey + ")");
    },
    async stop(server) {
        if (server.process) {
            server.process.kill('SIGKILL');
        }
        try {
            if (server.dbFile) {
                await fs.unlink(`${server.dbFile}.h2.db`);
            }
        } catch (e) {
        }
    }
});

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
