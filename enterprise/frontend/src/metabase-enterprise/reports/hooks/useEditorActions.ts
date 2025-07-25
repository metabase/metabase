import { useCallback } from "react";

import styles from "../components/ReportPage.module.css";

export function useEditorActions() {
  const handleQuestionClick = useCallback(
    (questionId: number, editorInstance: any) => {
      if (!editorInstance) {
        return;
      }

      const { doc } = editorInstance.state;
      let targetPos = null;

      doc.descendants((node: any, pos: number) => {
        if (
          node.type.name === "questionEmbed" &&
          node.attrs.questionId === questionId
        ) {
          targetPos = pos;
          return false;
        }
      });

      if (targetPos !== null) {
        editorInstance
          .chain()
          .focus()
          .setTextSelection(targetPos)
          .scrollIntoView()
          .run();
        const domNode = editorInstance.view.nodeDOM(targetPos);
        if (domNode) {
          domNode.classList.add(styles.highlighted);
          setTimeout(() => {
            domNode.classList.remove(styles.highlighted);
          }, 2000);
        }
      }
    },
    [],
  );

  return {
    handleQuestionClick,
  };
}
