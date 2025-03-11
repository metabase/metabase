import type { KeyboardEvent } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { formatNumber } from "metabase/lib/formatting";
import { useDispatch } from "metabase/lib/redux";
import { setLimit } from "metabase/query_builder/actions";
import { NumberInput, Radio, type RadioGroupProps, Stack } from "metabase/ui";
import type { Limit } from "metabase-lib";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { HARD_ROW_LIMIT } from "metabase-lib/v1/queries/utils";

import LimitPopoverS from "./LimitPopover.module.css";

type UseCustomQuestionRowLimit = { question: Question };

export const useCustomQuestionRowLimit = ({
  question,
}: UseCustomQuestionRowLimit) => {
  const dispatch = useDispatch();

  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  const canChangeLimit = !isNative && isEditable;

  const limit = canChangeLimit ? Lib.currentLimit(question.query(), -1) : null;

  const onChangeLimit = (limit: Limit) => {
    dispatch(setLimit(limit && limit > 0 ? limit : null));
  };

  return {
    limit,
    canChangeLimit,
    onChangeLimit,
  };
};

type CustomRowLimitProps = UseCustomQuestionRowLimit & { onClose: () => void };

const CustomRowLimit = ({ question, onClose }: CustomRowLimitProps) => {
  const { limit, onChangeLimit } = useCustomQuestionRowLimit({ question });
  return (
    <NumberInput
      value={limit === null ? "" : limit}
      min={1}
      type="number"
      placeholder={t`Enter a limit`}
      className={LimitPopoverS.Input}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          const value = parseInt(e.currentTarget.value, 10);
          if (value > 0) {
            onChangeLimit(value);
          } else {
            onChangeLimit(null);
          }
          if (onClose) {
            onClose();
          }
        }
      }}
    />
  );
};

type LimitPopoverProps = UseCustomQuestionRowLimit & {
  onClose: () => void;
} & Omit<RadioGroupProps, "value" | "onChange" | "children">;

export const LimitPopover = ({
  question,
  onClose,
  ...radioProps
}: LimitPopoverProps) => {
  const { limit, onChangeLimit } = useCustomQuestionRowLimit({ question });

  return (
    <Radio.Group
      onChange={value =>
        value === "maximum" ? onChangeLimit(null) : onChangeLimit(2000)
      }
      value={limit == null ? "maximum" : "custom"}
      {...radioProps}
    >
      <Stack>
        <Radio
          label={t`Show maximum (first ${formatNumber(HARD_ROW_LIMIT)})`}
          value="maximum"
        />
        <Radio
          label={<CustomRowLimit question={question} onClose={onClose} />}
          value="custom"
          classNames={{ body: CS.alignCenter }}
        />
      </Stack>
    </Radio.Group>
  );
};
