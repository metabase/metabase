import cx from "classnames";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { toggleDataReference } from "metabase/query_builder/actions";
import { Box, Icon, Tooltip } from "metabase/ui";

import DataReferenceButtonS from "./DataReferenceButton.module.css";

interface DataReferenceButtonProps {
  className?: string;
  isShowingDataReference: boolean;
  size: number;
}

export const DataReferenceButton = ({
  className,
  isShowingDataReference,
  size,
}: DataReferenceButtonProps) => {
  const dispatch = useDispatch();

  return (
    <Tooltip label={t`Learn about your data`}>
      <Box
        component="a"
        h={size}
        className={cx(className, DataReferenceButtonS.ButtonRoot, {
          [DataReferenceButtonS.isSelected]: isShowingDataReference,
        })}
      >
        <Icon
          name="reference"
          size={size}
          onClick={() => {
            dispatch(toggleDataReference());
          }}
        />
      </Box>
    </Tooltip>
  );
};
