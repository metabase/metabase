/* @flow */

import _ from "underscore";

export const mbql = (a: string):string =>
    typeof a === "string" ? a.toLowerCase().replace(/_/g, "-") : a;

export const mbqlEq = (a: string, b: string): boolean =>
    mbql(a) === mbql(b);

export const noNullValues = (clause: any[]): boolean =>
    _.all(clause, c => c != null);

// these are mostly to circumvent Flow type checking :-/
export const op = (clause: any): string =>
    clause[0];
export const args = (clause: any[]): any[] =>
    clause.slice(1);

export const add = <T>(items: T[], item: T): T[] =>
    [...items, item];
export const update = <T>(items: T[], index: number, newItem: T): T[] =>
    [...items.slice(0, index), newItem, ...items.slice(index + 1)];
export const remove = <T>(items: T[], index: number): T[] =>
    [...items.slice(0, index), ...items.slice(index + 1)];
export const clear = <T>(): T[] =>
    [];
