import { Box, Paper } from "metabase/ui";

import { Editor } from "./Editor";
import styles from "./ReportPage.module.css";

export const ReportPage = () => {
  return (
    <Box className={styles.editorWrapper}>
      <Box className={styles.editorContainer}>
        <Paper shadow="sm" className={styles.editorPaper}>
          <Editor />
        </Paper>
      </Box>
    </Box>
  );
};
