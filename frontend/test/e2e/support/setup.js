import { USE_SAUCE, startSauceConnect } from './sauce';
import { startServer } from "./start-server";
import { createDriver } from "./driver";

export const setup = async ({
    dbKey = "frontend/test/e2e/support/fixtures/metabase.db"
} = {}) => {
    const [server, sauceConnect] = await Promise.all([
        startServer(dbKey),
        USE_SAUCE ? startSauceConnect() : Promise.resolve()
    ]);

    const driver = createDriver();

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
    await Promise.all([
        server.stop(),
        driver.quit(),
        USE_SAUCE ? sauceConnect.close() : Promise.resolve()
    ]);
};
