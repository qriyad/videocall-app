const yonlendir = (url) => {
    document.location.href = url;
};

document.getElementById('checkbox-login').onclick = function() {
  document.getElementById('checkbox-login').parentElement.style.color = this.checked ? "black" : "red";
};