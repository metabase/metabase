import { useState, useCallback } from "react";
import { t } from "ttag";

import { Box, Button, Stack, Text } from "metabase/ui";

import { Editor } from "./Editor";
import styles from "./ReportPage.module.css";

export const ReportPage = () => {
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [questionRefs, setQuestionRefs] = useState<Array<{id: number, name: string}>>([]);

  const handleSave = useCallback(() => {
    if (!editorInstance) return;
    
    const markdown = editorInstance.storage.markdown?.getMarkdown();
    const reportData = {
      title: "New Report",
      content: markdown,
      questionReferences: questionRefs,
      createdAt: new Date().toISOString(),
    };
    
    console.log("Report data to save:", reportData);
  }, [editorInstance, questionRefs]);

  const handleQuestionClick = useCallback((questionId: number) => {
    if (!editorInstance) return;
    
    // Find the question embed node in the document
    const { doc } = editorInstance.state;
    let targetPos = null;
    
    doc.descendants((node, pos) => {
      if (node.type.name === "questionEmbed" && node.attrs.questionId === questionId) {
        targetPos = pos;
        return false;
      }
    });
    
    if (targetPos !== null) {
      // Scroll to the node and highlight it
      editorInstance.chain()
        .focus()
        .setTextSelection(targetPos)
        .scrollIntoView()
        .run();
        
      // Add highlight effect
      const domNode = editorInstance.view.nodeDOM(targetPos);
      if (domNode) {
        domNode.classList.add(styles.highlighted);
        setTimeout(() => {
          domNode.classList.remove(styles.highlighted);
        }, 2000);
      }
    }
  }, [editorInstance]);

  return (
    <Box className={styles.reportPage}>
      <Box className={styles.mainContent}>
        <Box className={styles.documentContainer}>
          <Editor 
            onEditorReady={setEditorInstance}
            onQuestionRefsChange={setQuestionRefs}
          />
        </Box>
      </Box>
      
      <Box className={styles.sidebar}>
        <Stack spacing="lg" p="lg">
          <Button 
            variant="filled" 
            onClick={handleSave}
            fullWidth
          >
            {t`Save Report`}
          </Button>
          
          <Box>
            <Text size="sm" weight="bold" mb="sm">
              {t`Question References`}
            </Text>
            {questionRefs.length === 0 ? (
              <Text size="sm" color="text-light">
                {t`No questions embedded yet`}
              </Text>
            ) : (
              <Stack spacing="xs">
                {questionRefs.map((ref) => (
                  <Box
                    key={ref.id}
                    className={styles.questionRef}
                    onClick={() => handleQuestionClick(ref.id)}
                  >
                    <Text size="sm">{ref.name}</Text>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};
