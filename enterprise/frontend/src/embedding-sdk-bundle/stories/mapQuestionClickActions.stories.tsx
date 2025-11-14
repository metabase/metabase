import { useState } from "react";

import { InteractiveDashboard } from "embedding-sdk-bundle/components/public/dashboard";
import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { MetabaseDataPointObject } from "embedding-sdk-bundle/types";

export default {
  title: "EmbeddingSDK/Map Question Click Actions",
  decorators: [CommonSdkStoryWrapper],
  parameters: { layout: "fullscreen" },
};

export const PluginOpenMenu = (_args: any) => {
  const [modalData, setModalData] = useState<MetabaseDataPointObject | null>(
    null,
  );

  return (
    <div>
      <InteractiveDashboard
        dashboardId={1}
        withDownloads
        plugins={{
          mapQuestionClickActions: (clickActions, clicked) => {
            return [
              ...clickActions,
              {
                buttonType: "horizontal",
                name: "custom",
                title: "Open modal",
                onClick: () => {
                  setModalData(clicked);
                },
              },
            ];
          },
        }}
      />
      <SimpleModal open={Boolean(modalData)} onClose={() => setModalData(null)}>
        <p>You clicked on question: {modalData?.question?.name ?? "Unknown"}</p>
        <pre>{JSON.stringify({ ...modalData, raw: "redacted" }, null, 2)}</pre>
      </SimpleModal>
    </div>
  );
};

export const PluginDoActionDirectly = (_args: any) => {
  const [modalData, setModalData] = useState<MetabaseDataPointObject | null>(
    null,
  );

  return (
    <div>
      <InteractiveDashboard
        dashboardId={1}
        withDownloads
        plugins={{
          mapQuestionClickActions: (clickActions, clicked) => {
            return {
              onClick: () => {
                setModalData(clicked);
              },
            };
          },
        }}
      />
      <SimpleModal open={Boolean(modalData)} onClose={() => setModalData(null)}>
        <p>You clicked on question: {modalData?.question?.name ?? "Unknown"}</p>
        <pre>{JSON.stringify({ ...modalData, raw: "redacted" }, null, 2)}</pre>
      </SimpleModal>
    </div>
  );
};

export const PluginDoActionDependingOnData = (_args: any) => {
  const [modalData, setModalData] = useState<MetabaseDataPointObject | null>(
    null,
  );

  return (
    <div>
      <p>
        On the E-Commerce Insights dashboard, this should open the modal
        directly on the first chart, and add the action to the menu on the
        others
      </p>
      <InteractiveDashboard
        dashboardId={1}
        withDownloads
        plugins={{
          mapQuestionClickActions: (clickActions, clicked) => {
            // this should be the first chart in the E-Commerce Insights dashboard
            if (clicked.question?.id === 12) {
              return {
                onClick: () => {
                  setModalData(clicked);
                },
              };
            }
            return [
              ...clickActions,
              {
                name: "custom",
                title: "Open modal",
                buttonType: "horizontal",
                onClick: () => {
                  setModalData(clicked);
                },
              },
            ];
          },
        }}
      />
      <SimpleModal open={Boolean(modalData)} onClose={() => setModalData(null)}>
        <p>You clicked on question: {modalData?.question?.name ?? "Unknown"}</p>
        <pre>{JSON.stringify({ ...modalData, raw: "redacted" }, null, 2)}</pre>
      </SimpleModal>
    </div>
  );
};

const SimpleModal = ({
  open,
  onClose,
  children,
}: React.PropsWithChildren<{
  open: boolean;
  onClose: () => void;
}>) => {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            color: "#666",
            lineHeight: 1,
          }}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
};
