
declare module "selenium-webdriver" {

    declare class WebDriver {
        get(url: string): Promise<void>;
        wait(condition: Condition|Function, timeout: ?number): WebElementPromise;
        findElement(selector: By): WebElementPromise;
        deleteAllCookies(): Promise<void>;
        getCurrentUrl(): Promise<string>;
    }

    declare class WebElement {
        findElement(selector: By): WebElementPromise;
        click(): Promise<void>;
        sendKeys(keys: string): Promise<void>;
        clear(): Promise<void>;
        getText(): Promise<string>;
        getAttribute(attribute: string): Promise<string>;
    }

    declare class WebElementPromise extends WebElement {
    }

    declare class Condition {
    }

    declare class By {
        static css(selector: string): By;
        static xpath(selector: string): By;
    }

    declare class until {
        static elementLocated(selector: By): Condition;
    }
}
