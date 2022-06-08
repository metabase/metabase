import React from "react";
import { range } from "lodash";
import {
  SkeletonCell,
  SkeletonColumn,
  SkeletonRoot,
} from "./TableSkeleton.styled";

const ROWS = 6;
const COLUMNS = 3;

const TableSkeleton = (): JSX.Element => {
  return (
    <SkeletonRoot>
      {range(COLUMNS).map(i => (
        <SkeletonColumn key={i} style={{ width: `${75 / COLUMNS}%` }}>
          {range(ROWS).map(j => (
            <SkeletonCell key={j} style={{ height: `${45 / ROWS}%` }} />
          ))}
        </SkeletonColumn>
      ))}
    </SkeletonRoot>
  );
};

export default TableSkeleton;
