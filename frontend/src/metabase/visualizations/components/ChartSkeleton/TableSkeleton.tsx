import React from "react";
import { range } from "lodash";
import { percentage } from "./utils";
import {
  SkeletonCell,
  SkeletonColumn,
  SkeletonRoot,
} from "./TableSkeleton.styled";

const ROWS = 6;
const COLUMNS = 3;
const ROWS_DENSITY = 0.45;
const COLUMNS_DENSITY = 0.75;

const TableSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {range(COLUMNS).map(i => (
        <SkeletonColumn
          key={i}
          style={{ width: percentage(COLUMNS_DENSITY / COLUMNS) }}
        >
          {range(ROWS).map(j => (
            <SkeletonCell
              key={j}
              style={{ height: percentage(ROWS_DENSITY / ROWS) }}
            />
          ))}
        </SkeletonColumn>
      ))}
    </SkeletonRoot>
  );
};

export default TableSkeleton;
