/* @flow */

import { nyi } from "../utils";

export default class Breakout {
    displayName: string;
    icon: string;

    @nyi remove() {}
    @nyi options(): BreakoutOption[] {
        return [];
    }
}

export class BreakoutOption {
    displayName: string;
    icon: string;
    section: string;
    isSelected: ?boolean;

    @nyi add() {}
}
