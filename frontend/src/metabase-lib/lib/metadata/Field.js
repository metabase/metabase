/* @flow */

import Table from "./Table";

/**
 * Wrapper class for field metadata objects. Belongs to a Table.
 */
export default class Field {
    displayName: string;
    description: string;

    table: Table;
}
