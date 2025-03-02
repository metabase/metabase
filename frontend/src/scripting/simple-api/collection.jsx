import dayjs from "dayjs";
import { ApiCollectionApi, ApiCollectionIdPutRequest } from "../core-api/dist";
import { DescriptionOfUpdate, trackPromiseGlobally } from "./jobs";
import { apiClient } from "./apiClient";

export const Collections = {};

export class Collection {
  constructor(data) {
    this.savedData = data;
    this.name = data.name;
    this.archived = data.archived ?? false;
    this.description = data.description;
    this.id = data.id;
    this.created_at = dayjs(data.created_at);
    Collections.idToName.set(this.id, this.name);
  }
  async delete() {
    await Collections.delete(this.id);
  }

  /** Update the DB with the values in the object's fields */
  async save() {
    const fields = ["name", "archived", "description"];
    const newData = {};
    for (const f of fields) {
      // If the saved version of the field differs from the one attached to the object, add to put request
      if (this[f] !== this.savedData[f]) {
        newData[f] = this[f];
      }
    }
    if (Object.values(newData).length) {
      Collections.update(this.id, newData);
    }
  }
}

let globalPromiseId = 0;

Collections.update = async (id, newData) => {
  const api = new ApiCollectionApi(apiClient);

  const promise = new Promise((resolve, reject) => {
    const apiCollectionIdPutRequest = new ApiCollectionIdPutRequest();
    Object.assign(apiCollectionIdPutRequest, newData);

    const opts = {
      apiCollectionIdPutRequest,
    };
    api.apiCollectionIdPut(id, opts, function (error, data, _response) {
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
      title={`Update collection: ${Collections.idToName.get(id) || id}`}
      newData={newData}
    />,
    globalPromiseId++,
  );
  return promise;
};

Collections.delete = async id => {
  return Collections.update(id, { archived: true });
};

Collections.idToName = new Map();

Collections.all = async () => {
  const api = new ApiCollectionApi(apiClient);
  return new Promise((resolve, reject) => {
    api.apiCollectionGet(null, function (error, _data, response) {
      const data = response.body;
      const collections = data.map(item => new Collection(item));
      if (error) {
        reject(error);
      } else {
        resolve(collections);
      }
    });
  });
};
