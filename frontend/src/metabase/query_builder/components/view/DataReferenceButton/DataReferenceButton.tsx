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
  onClick?: () => void;
}

export const DataReferenceButton = ({
  className,
  isShowingDataReference,
  size,
  onClick,
}: DataReferenceButtonProps) => {
  const dispatch = useDispatch();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      dispatch(toggleDataReference());
    }
  };

  return (
    <Tooltip label={t`Learn about your data`}>
      <Box
        aria-label={t`Learn about your data`}
        component="a"
        h={size}
        className={cx(className, DataReferenceButtonS.ButtonRoot, {
          [DataReferenceButtonS.isSelected]: isShowingDataReference,
        })}
      >
        <Icon name="reference" size={size} onClick={handleClick} />
      </Box>
    </Tooltip>
  );
};
