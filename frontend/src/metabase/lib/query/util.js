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
