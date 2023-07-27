import { t } from "ttag";

export function ModelListView() {
  return (
    <div className="wrapper mt4" style={{ padding: "1rem 5%" }}>
      <h1>{t`Models`}</h1>

      <ol className="mt1">
        <li>Model</li>
        <li>Model</li>
        <li>Model</li>
        <li>Model</li>
      </ol>
    </div>
  );
}
