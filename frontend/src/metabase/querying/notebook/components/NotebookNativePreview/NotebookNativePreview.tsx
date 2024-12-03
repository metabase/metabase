import AceEditor from "react-ace";
import { t } from "ttag";

import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker/components/LoadingSpinner";
import { color } from "metabase/lib/colors";
import { NativeQueryEditorRoot } from "metabase/query_builder/components/NativeQueryEditor/NativeQueryEditor.styled";
import { Box, Flex, Icon, rem } from "metabase/ui";

import { useNotebookNativePreview } from "./hooks";

export const NotebookNativePreview = (): JSX.Element => {
  const {
    engineType,
    showLoader,
    showError,
    showQuery,
    formattedQuery,
    errorMessage,
    title,
  } = useNotebookNativePreview();

  return (
    <Box
      component="aside"
      data-testid="native-query-preview-sidebar"
      w="100%"
      h="100%"
      bg="bg-white"
      display="flex"
      style={{ flexDirection: "column" }}
    >
      <Box
        component="header"
        c={color("text-dark")}
        fz={rem(20)}
        lh={rem(24)}
        fw="bold"
        ta="start"
        p="1.5rem"
      >
        {title}
      </Box>
      <Box style={{ flex: 1 }}>
        {showLoader && <DelayedLoadingSpinner delay={1000} />}
        {showError && (
          <Flex align="center" justify="center" h="100%" direction="column">
            <Icon name="warning" size="2rem" color={color("error")} />
            {t`Error generating the query.`}
            <Box mt="sm">{errorMessage}</Box>
          </Flex>
        )}
        {showQuery && (
          <NativeQueryEditorRoot style={{ height: "100%", flex: 1 }}>
            <AceEditor
              value={formattedQuery}
              mode={engineType}
              readOnly
              height="100%"
              highlightActiveLine={false}
              navigateToFileEnd={false}
              width="100%"
              fontSize={12}
              style={{ backgroundColor: color("bg-light") }}
              showPrintMargin={false}
              setOptions={{
                highlightGutterLine: false,
              }}
            />
          </NativeQueryEditorRoot>
        )}
      </Box>
    </Box>
  );
};
