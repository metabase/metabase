import { dashboard } from "./dashboards";
import { dataAppPage } from "./dataApps";
import { question, dataset, tableRowsQuery } from "./questions";
import { pulse } from "./pulses";

export const exportFormats = ["csv", "xlsx", "json"];

export function accountSettings() {
  return "/account/profile";
}

function prepareModel(item) {
  if (item.model_object) {
    return item.model_object;
  }
  return {
    id: item.model_id,
    ...item.details,
  };
}

export function modelToUrl(item) {
  const modelData = prepareModel(item);

  switch (item.model) {
    case "card":
      return question(modelData);
    case "dataset":
      return dataset(modelData, { isModelDetail: true });
    case "dashboard":
      return dashboard(modelData);
    case "page":
      return dataAppPage({ id: modelData.app_id }, { id: modelData.id });
    case "pulse":
      return pulse(modelData.id);
    case "table":
      return tableRowsQuery(modelData.db_id, modelData.id);
    default:
      return null;
  }
}
