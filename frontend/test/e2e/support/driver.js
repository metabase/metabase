import webdriver from "selenium-webdriver";
import { USE_SAUCE, sauceCapabilities, sauceServer } from './sauce';

export const createDriver = ({ name }) => USE_SAUCE ?
    new webdriver.Builder()
        .withCapabilities({
            ...sauceCapabilities,
            name: name
        })
        .usingServer(sauceServer)
        .build() :
    new webdriver.Builder()
        .forBrowser('chrome')
        .build();
