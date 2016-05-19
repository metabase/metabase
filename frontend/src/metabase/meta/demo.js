/* @flow */

// import "./metadata/demo"

import type { CardObject } from "./types/Card";

import * as Card from "./Card";
import * as Query from "./Query";

const card : CardObject = {
    dataset_query: {
        "database":10,
        "type":"query",
        "query":{
            "source_table":89,
            "aggregation":["metric",6],
            "breakout":[],
            "filter":["and",["segment",7]]
        }
    }
};

console.log(Card.isStructured(card));
console.log(Card.isNative(card));

// console.log(DatasetQuery.isNative({})); // FAILS TYPECHECKING!
