import dayjs from "dayjs";

import { ApiCardIdPutRequest, ApiCardApi, ApiCardsApi } from "../core-api/dist";

import { apiClient } from "./apiClient";
import { DescriptionOfUpdate, trackPromiseGlobally } from "./jobs";

export const Questions = {};

export class Question {
  constructor(data) {
    this.savedData = data;
    this.archived = data.archived ?? false;
    this.collection = data.collection;
    this.collection_id = data.collection_id;
    this.created_at = dayjs(data.created_at);
    this.creator = data.creator;
    this.dashboard_id = data.dashboard_id;
    this.database_id = data.database_id;
    this.dataset_query = data.dataset_query;
    this.description = data.description;
    this.display = data.display;
    this.entity_id = data.entity_id;
    this.id = data.id;
    this.last_edit_info = data["last-edit-info"];
    this.last_used_at = data.last_used_at;
    this.name = data.name;
    this.query_type = data.query_type;
    this.source_card_id = data.source_card_id;
    this.table_id = data.table_id;
    this.type = data.type;
    this.updated_at = dayjs(data.updated_at);
    this.view_count = data.view_count;
    this.visualization_settings = data.visualization_settings;
    Questions.idToName.set(this.id, this.name);
  }

  async populate() {
    const api = new ApiCardApi(apiClient);
    const opts = {};
    return new Promise((resolve, reject) => {
      api.apiCardIdGet(this.id, opts, (error, _data, response) => {
        const data = response.body;
        this.result_metadata = data.result_metadata;
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }

  async delete() {
    await Questions.delete(this.id);
  }

  /** Update the DB with the values in the object's fields */
  async save() {
    const fields = ["name", "archived", "description", "result_metadata"];
    const newData = {};
    for (const f of fields) {
      // If the saved version of the field differs from the one attached to the object, add to put request
      if (this[f] !== this.savedData[f]) {
        newData[f] = this[f];
      }
    }
    if (Object.values(newData).length) {
      Questions.update(this.id, newData);
    }
  }
}

let globalPromiseId = 0;

Questions.update = async (id, newData) => {
  const api = new ApiCardApi(apiClient);

  const promise = new Promise((resolve, reject) => {
    const apiCardIdPutRequest = new ApiCardIdPutRequest();
    Object.assign(apiCardIdPutRequest, newData);

    const opts = {
      apiCardIdPutRequest,
    };
    api.apiCardIdPut(id, opts, function (error, data, _response) {
      if (error) {
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
  trackPromiseGlobally(
    promise,
    <DescriptionOfUpdate
      title={`Update question ${Questions.idToName.get(id) || id}`}
      newData={newData}
    />,
    globalPromiseId++,
  );
  return promise;
};

Questions.delete = async id => {
  return Questions.update(id, { archived: true });
};

Questions.idToName = new Map();

Questions.all = async () => {
  const api = new ApiCardApi(apiClient);
  const f = "all";
  const opts = {};
  return new Promise((resolve, reject) => {
    api.apiCardGet(f, opts, function (error, _data, response) {
      const data = response.body;
      const questions = data.map(item => new Question(item));
      if (error) {
        reject(error);
      } else {
        resolve(questions);
      }
    });
  });
};
