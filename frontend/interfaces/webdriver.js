
declare module "selenium-webdriver" {

    declare class WebDriver {
        wait(condition: Condition|Function, timeout: ?number): Promise<WebElement>;
        findElement(selector: By): WebElement;
    }

    declare class WebElement {
        click(): Promise<void>;
        findElement(selector: By): WebElement;
        getText(): Promise<string>;
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
