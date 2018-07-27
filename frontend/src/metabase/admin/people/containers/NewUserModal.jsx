import React from "react";
import UserForm from "metabase/admin/people/containers/UserForm";
import { goBack } from "react-router-redux";

const NewUserModal = ({ onClose }) =>
  <UserForm
    onClose={onClose}
  />

export default NewUserModal
