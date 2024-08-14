import passwordGenerator from "password-generator";

import MetabaseSettings from "metabase/lib/settings";

// generate a password that satisfies `complexity` requirements, by default the ones that come back in the
// `password-complexity` Setting; must be a map like {total: 6, number: 1}
export const generatePassword = complexity => {
  complexity =
    complexity || MetabaseSettings.passwordComplexityRequirements() || {};
  // generated password must be at least `complexity.total`, but can be longer
  // so hard code a minimum of 14
  const len = Math.max(complexity.total || 0, 14);

  let password = "";
  let tries = 0;
  while (!isStrongEnough(password) && tries < 100) {
    password = passwordGenerator(len, false, /[\w\d\?\-]/);
    tries++;
  }
  return password;

  function isStrongEnough(password) {
    const uc = password.match(/([A-Z])/g);
    const lc = password.match(/([a-z])/g);
    const di = password.match(/([\d])/g);
    const sc = password.match(/([!@#\$%\^\&*\)\(+=._-{}])/g);

    return (
      uc &&
      uc.length >= (complexity.upper || 0) &&
      lc &&
      lc.length >= (complexity.lower || 0) &&
      di &&
      di.length >= (complexity.digit || 0) &&
      sc &&
      sc.length >= (complexity.special || 0)
    );
  }
};
