import { spawn } from "child_process";
import fetch from 'isomorphic-fetch';
import { delay } from '../../../src/metabase/lib/promise';

let port = 4000;
const getPort = () => port++;

const servers = new Map();

export async function startServer(dbFile) {
    if (!servers.has(dbFile)) {
        const port = getPort();
        let server = {
            dbFile: dbFile,
            port: port,
            host: `http://localhost:${port}`,
            process: spawn("java", ["-jar", "target/uberjar/metabase.jar"], {
                env: {
                    MB_DB_FILE: dbFile,
                    MB_JETTY_PORT: port
                },
            }),
            count: 0
        }
        server.process.on("close", () => {
            killServer(server);
        })
        servers.set(dbFile, server);
    }
    const server = servers.get(dbFile);
    server.count++;
    await wait(server);
    return server.host;
}

export async function stopServer(dbFile) {
    const server = servers.get(dbFile);
    if (--server.count === 0) {
        killServer(server);
    }
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

async function wait(server) {
    while (!(await isReady(server.host))) {
        await delay(500);
    }
}

function killServer(server) {
    console.log("shutting down " + server.dbFile);
    servers.delete(server.dbFile);
    server.process.kill();
}

process.once("exit", () => {
    for (const server of servers) {
        killServer(server);
    }
});
