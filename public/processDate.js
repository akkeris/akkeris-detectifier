/* eslint-disable */

window.onload = (event) => {
  Array.from(document.getElementsByClassName('date-item')).forEach((el) => {
    el.innerHTML = moment(el.innerHTML).format('MM/DD/YY, HH:MM A');
  });
};
