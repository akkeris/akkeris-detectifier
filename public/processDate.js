window.onload = (event) => {
  Array.from(document.getElementsByClassName('date-item')).forEach((el) => el.innerHTML = (new Date(el.innerHTML)).toLocaleString());
};
