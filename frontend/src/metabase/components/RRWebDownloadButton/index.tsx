import { useState } from "react";

import { BulkActionBar } from "metabase/components/BulkActionBar/BulkActionBar";
import { getAllEvents } from "metabase/lib/rrweb-recorder";
import { Button } from "metabase/ui/components/buttons/Button";
import { Loader } from "metabase/ui/components/feedback/Loader/Loader";
import { Icon } from "metabase/ui/components/icons/Icon";
import { Tooltip } from "metabase/ui/components/overlays/Tooltip";

export const RRWebDownloadButton = () => {
  const [isSending, setIsSending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSendToSlack = async () => {
    setIsSending(true);
    try {
      const events = await getAllEvents();
      const combinedData = {
        rrwebEvents: events.filter(event => event.type !== "xhr"),
        xhrEvents: events.filter(event => event.type === "xhr"),
      };

      const response = await fetch("/api/util/send-to-slack", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(combinedData),
      });

      if (response.ok) {
        setToastMessage("Bug report data sent to Slack successfully!");
      } else {
        throw new Error("Failed to send data to Slack");
      }
    } catch (error) {
      console.error("Error sending data to Slack:", error);
      setToastMessage(
        "Failed to send bug report data to Slack. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {!toastMessage && (
        <Tooltip label="Send bug report to Slack">
          <Button
            style={{
              position: "fixed",
              bottom: "20px",
              right: "20px",
              zIndex: 9999,
            }}
            onClick={handleSendToSlack}
            disabled={isSending}
            variant="subtle"
          >
            {isSending ? <Loader size="sm" /> : <Icon name="bug" size={16} />}
            <span />
          </Button>
        </Tooltip>
      )}
      <BulkActionBar opened={!!toastMessage} message={toastMessage || ""}>
        <Button onClick={() => setToastMessage(null)}>Dismiss</Button>
      </BulkActionBar>
    </>
  );
};
