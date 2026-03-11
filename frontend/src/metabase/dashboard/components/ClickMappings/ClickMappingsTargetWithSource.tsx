import cx from "classnames";
import { dissocIn, getIn } from "icepick";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type { ClickBehavior } from "metabase-types/api";

import type { SourceType, TargetItem } from "./types";

export function ClickMappingsTargetWithSource({
  target,
  targetName,
  clickBehavior,
  updateSettings,
}: {
  target: TargetItem;
  targetName: string | undefined;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { name, id } = target;
  const source: { name?: string; type?: SourceType } =
    getIn(clickBehavior, ["parameterMapping", id, "source"]) ?? {};

  return (
    <div className={CS.mb2}>
      <div
        className={cx(
          CS.bordered,
          CS.rounded,
          CS.p2,
          CS.textMedium,
          CS.flex,
          CS.alignCenter,
        )}
        // eslint-disable-next-line metabase/no-color-literals
        style={{ borderColor: "#E2E4E8" }}
      >
        <svg
          width="12"
          height="38"
          viewBox="0 0 12 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ marginLeft: 8, marginRight: 8 }}
        >
          <g opacity="0.6">
            <path
              d="M9 32C9 33.6569 7.65685 35 6 35C4.34315 35 3 33.6569 3 32C3 30.3431 4.34315 29 6 29C7.65685 29 9 30.3431 9 32Z"
              // eslint-disable-next-line metabase/no-color-literals
              fill="#509EE3"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 6C12 8.973 9.83771 11.441 7 11.917V26.083C9.83771 26.559 12 29.027 12 32C12 35.3137 9.31371 38 6 38C2.68629 38 0 35.3137 0 32C0 29.027 2.16229 26.559 5 26.083V11.917C2.16229 11.441 0 8.973 0 6C0 2.68629 2.68629 0 6 0C9.31371 0 12 2.68629 12 6ZM6 10C8.20914 10 10 8.20914 10 6C10 3.79086 8.20914 2 6 2C3.79086 2 2 3.79086 2 6C2 8.20914 3.79086 10 6 10ZM6 36C8.20914 36 10 34.2091 10 32C10 29.7909 8.20914 28 6 28C3.79086 28 2 29.7909 2 32C2 34.2091 3.79086 36 6 36Z"
              // eslint-disable-next-line metabase/no-color-literals
              fill="#509EE3"
            />
          </g>
        </svg>
        <div>
          <div>
            <span className={cx(CS.textBold, CS.textDark)}>{source.name}</span>{" "}
            {source.type != null &&
              {
                column: t`column`,
                parameter: t`filter`,
                userAttribute: t`user attribute`,
              }[source.type]}
          </div>
          <div style={{ marginTop: 9 }}>
            <span className={cx(CS.textBrand, CS.textBold)}>{name}</span>{" "}
            {targetName}
          </div>
        </div>
        <div
          className={cx(CS.cursorPointer, CS.mlAuto)}
          onClick={() =>
            updateSettings(dissocIn(clickBehavior, ["parameterMapping", id]))
          }
        >
          <Icon name="close" size={12} />
        </div>
      </div>
    </div>
  );
}
