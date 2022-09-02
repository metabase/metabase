/* eslint-disable react/prop-types */
import Link from "metabase/core/components/Link";
import React from "react";
import { trackStructEvent } from "metabase/lib/analytics";

const ItemCommon = ({ url, thumb, name, target }) => {
  return (
    <Link
      to={url}
      target={target}
      onClick={() => trackStructEvent(`ItemCommon click link ${name}`)}
    >
      {thumb ? (
        <div className="dashboards__recommendations-thumb">
          {/*<Thumb src={thumb} name={name} />*/}
        </div>
      ) : null}
      {name ? (
        <h3 className="dashboards__recommendations-title">{name}</h3>
      ) : null}
    </Link>
  );
};

export default ItemCommon;
