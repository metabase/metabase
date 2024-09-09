import { Button } from "metabase/ui";
import { useState } from "react";
import {
  formatAndCleanCubeContent,
  extractCubeName,
} from "metabase/components/Cube/utils";
import { t } from "ttag";

interface SingleCubeProps {
  cube: any;
  isExpanded: boolean;
  onExpand?: () => void;
  onUpdate?: (updatedCube: any, originalCube: any) => void;
}

export const SingleCube: React.FC<SingleCubeProps> = ({
  cube,
  isExpanded,
  onExpand,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(true);
  const [originalCubeContent, setOriginalCubeContent] = useState(cube.content);
  const [editedContent, setEditedContent] = useState(
    formatAndCleanCubeContent(cube.content),
  );

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    try {
      const updatedCube = editedContent;
      if (onUpdate) onUpdate(updatedCube, originalCubeContent);
      setIsEditing(false);
    } catch (error) {}
  };

  const handleCancel = () => {
    setEditedContent(formatAndCleanCubeContent(cube.content));
    setIsEditing(false);
  };

  return (
    <div>
      <div>
        <div onClick={onExpand}></div>
      </div>
      {isExpanded && (
        <div>
          <div>
            {isEditing ? (
              <>
                <textarea
                  style={{ width: "50vw", height: "60vh" }}
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                />
                <div>
                  <Button
                    onClick={handleCancel}
                    style={{
                      minWidth: "150px",
                      textTransform: "none",
                      fontWeight: "500",
                      fontSize: "14px",
                      lineHeight: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "100px",
                      border: "1px solid white",
                      color: "#0458DD",
                    }}
                    variant="outlined"
                  ></Button>
                  <Button
                    onClick={handleSave}
                    style={{
                      minWidth: "150px",
                      background: "rgba(80, 158, 227, 0.2)",
                      textTransform: "none",
                      fontWeight: "500",
                      fontSize: "14px",
                      lineHeight: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#587330",
                    }}
                    variant="outlined"
                  >
                    <div>{t`SAVE`}</div>
                  </Button>
                </div>
              </>
            ) : (
              <pre>{formatAndCleanCubeContent(cube.content)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
