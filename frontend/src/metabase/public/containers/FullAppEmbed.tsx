import { SsoApi } from "metabase/services";
import { useEffect } from "react";
import { useDispatch } from "metabase/lib/redux";
import { push } from "react-router-redux";

export const FullAppEmbed = ({ location, ...props }) => {
  console.log(location);

  const { query } = location;
  const dispatch = useDispatch();

  useEffect(() => {
    SsoApi.jwt({
      jwt: query.jwt,
    }).then(res => {
      //console.log(res);
      dispatch(push(query.return_to));
    });
  });

  return <p>Super UX loading screen</p>;
};
