import React from "react";

import { useAreAnyTruncated } from "metabase/hooks/use-is-truncated";
import { Tooltip } from "metabase/ui";

import S from "./EllipsifiedPath.module.css";

type EllipsifiedPathProps = { items: string[]; tooltip: string };

/**
 * Displays a path such as "Collection / Subcollection / Subsubcollection /
 * Parent Collection".
 *
 * If the path is too long to fit, some items may be truncated, like this:
 * "Collection / Subcollec... / Subsub... / Parent Collection".
 *
 * A tooltip is shown if any items are truncated.
 */
export const EllipsifiedPath = ({ items, tooltip }: EllipsifiedPathProps) => {
  const { areAnyTruncated, ref } = useAreAnyTruncated<HTMLDivElement>();

  return (
    <Tooltip label={tooltip} disabled={!areAnyTruncated} multiline maw="20rem">
      <div className={S.path}>
        {items.length > 1 && (
          <div className={S.dots}>
            … <div className={S.slash}>/</div>
          </div>
        )}
        {items.map((item, index) => {
          const key = `${item}${index}`;
          return (
            <React.Fragment key={key}>
              <div
                ref={el => el && ref.current.set(key, el)}
                className={S.item}
              >
                {item}
              </div>
              {index < items.length - 1 && <div className={S.slash}>/</div>}
            </React.Fragment>
          );
        })}
      </div>
    </Tooltip>
  );
};
