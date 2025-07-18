import { t } from "ttag";
import { Box, Container, Title } from "metabase/ui";

export interface ReportEditorProps {
  // Add props as needed
}

const ReportEditor = ({}: ReportEditorProps) => {
  return (
    <Box size="lg" py="xl">
      <Box>
        <Title order={1} mb="lg">
          {t`New Report`}
        </Title>
        <Box>
          {/* Report editor content will go here */}
          <p>{t`Report editor coming soon...`}</p>
        </Box>
      </Box>
    </Box>
  );
};

export default ReportEditor;
