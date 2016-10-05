import { USE_SAUCE, startSauceConnect } from './sauce';
import { startServer } from "./start-server";
import { createDriver } from "./driver";

export const DEFAULT_DB = "frontend/test/e2e/support/fixtures/metabase.db";

export const setup = async ({
    name,
    dbKey = DEFAULT_DB
} = {}) => {
    const [server, sauceConnect] = await Promise.all([
        startServer(dbKey),
        USE_SAUCE ? startSauceConnect() : Promise.resolve()
    ]);

    const driver = createDriver({ name: name });

    return {
        server,
        sauceConnect,
        driver
    };
};

export const cleanup = async ({
    server,
    sauceConnect,
    driver
}) => {
    try {
        await Promise.all([
            server.stop(),
            driver.quit(),
            USE_SAUCE ? sauceConnect.close() : Promise.resolve()
        ]);
    } catch (e) {
        console.log("Error in cleanup()", e);
    }
};
