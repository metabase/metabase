import React from "react"
import { connect } from "react-redux"
import { Box } from "grid-styled"
import { jt } from "ttag"

import Subhead from "metabase/components/type/Subhead"

const Greeting = connect(state => ({
  user: state.currentUser,
}))(({ user }) => {
  return (
    <Box mb={3}>
      <Subhead>{jt`Hello there, ${user.first_name}`}</Subhead>
    </Box>
  );
});

export default Greeting