import { Box } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

// import styles from './Preview.module.css';

interface Props {
  values: RowValue[];
}

export const Preview = ({ values }: Props) => {
  if (values.length === 0) {
    return null;
  }

  return (
    <Box>
      {values.map((value, index) => (
        <Box key={index}>{value}</Box>
      ))}
    </Box>
  );
};
