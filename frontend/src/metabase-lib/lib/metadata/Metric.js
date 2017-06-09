/* @flow weak */

import Base from "./Base";
import Question from "../Question";
import Database from "./Database";
import Table from "./Table";
import Dimension, { DatetimeFieldDimension } from "metabase-lib/lib/Dimension";

/**
 * Wrapper class for a metric. Belongs to a {@link Database} and possibly a {@link Table}
 */
export default class Metric extends Base {
    displayName: string;
    description: string;

    database: Database;
    table: Table;

    isCompatibleWithBreakoutDimension(dimensionType: typeof Dimension): boolean {
        if (dimensionType === DatetimeFieldDimension) {
            return this.table.dateFields().length > 0;
        } else {
            console.log('didnt match the selector :(', dimensionType);
            return false;
        }
    }

    breakoutDimensionOptions(dimensionType: typeof Dimension): Dimension[] {
        if (dimensionType === DatetimeFieldDimension) {
            return this.table.dateFields().map((field) => field.dimension());
        } else {
            return [];
        }
    }

    newQuestion(): Question {
        // $FlowFixMe
        return new Question();
    }
}
