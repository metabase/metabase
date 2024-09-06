import { getAllEvents } from "metabase/lib/rrweb-recorder";
import { Button } from "metabase/ui/components/buttons/Button";

export const RRWebDownloadButton = () => {
  const handleDownload = async () => {
    const events = await getAllEvents();
    const combinedData = {
      rrwebEvents: events.filter(event => event.type !== "xhr"),
      xhrEvents: events.filter(event => event.type === "xhr"),
    };
    const blob = new Blob([JSON.stringify(combinedData)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bug-report-data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
      }}
      onClick={handleDownload}
    >
      Download Bug report data
    </Button>
  );
};
