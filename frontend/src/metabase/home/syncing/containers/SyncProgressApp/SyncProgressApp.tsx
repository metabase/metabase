import { getUser } from "metabase/selectors/user";

const mapStateToProps = (state: any) => ({
  user: getUser(state),
});
