const axios = require('axios');

async function isAuthenticated(token) {
  try {
    const user = await axios.get(`${process.env.AUTH_HOST}/user`, {
      headers: {
        Authorization: token,
        Accept: 'application/json',
      },
    });
    console.log(`User "${user.data.cn}" was successfully authenticated.`);
    return true;
  } catch (err) {
    if (err.response && err.response.status && err.response.status === 401) {
      return false;
    }
    throw err;
  }
}

module.exports = {
  isAuthenticated,
};
