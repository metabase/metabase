/* @flow */

export default class Breakout {
    displayName: string;
    icon: string;

    remove() {}
    options(): BreakoutOption[] {
        return [];
    }
}

export class BreakoutOption {
    displayName: string;
    icon: string;
    section: string;
    isSelected: ?boolean;

    add() {}
}
