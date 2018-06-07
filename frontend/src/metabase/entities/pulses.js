import { createEntity } from "metabase/lib/entities";
import * as Urls from "metabase/lib/urls";

import { normal } from "metabase/lib/colors";

const Pulses = createEntity({
  name: "pulses",
  path: "/api/pulse",

  objectActions: {
    // FIXME: not implemented in backend
    // setArchived: ({ id }, archived) => Pulses.actions.update({ id, archived }),
    setCollection: ({ id }, collection) =>
      Pulses.actions.update({
        id,
        collection_id: collection && collection.id,
      }),
  },

  objectSelectors: {
    getName: pulse => pulse && pulse.name,
    getUrl: pulse => pulse && Urls.pulse(pulse.id),
    getIcon: pulse => "pulse",
    getColor: pulse => normal.yellow,
  },
});

export default Pulses;
