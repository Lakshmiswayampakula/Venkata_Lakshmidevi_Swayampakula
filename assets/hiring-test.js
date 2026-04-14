(function () {
  if (window.HiringTestPageInitialized) return;
  window.HiringTestPageInitialized = true;

  var popup = document.querySelector("[data-hiring-popup]");
  if (!popup) return;

  var popupImage = popup.querySelector("[data-popup-image]");
  var popupTitle = popup.querySelector("[data-popup-title]");
  var popupDescription = popup.querySelector("[data-popup-description]");
  var popupPrice = popup.querySelector("[data-popup-price]");
  var popupOptions = popup.querySelector("[data-popup-options]");
  var popupForm = popup.querySelector("[data-popup-form]");
  var popupAddToCart = popup.querySelector("[data-popup-add]");
  var bonusHandle = popup.getAttribute("data-bonus-handle") || "soft-winter-jacket";

  var currentProduct = null;
  var currentVariant = null;

  function formatMoney(cents) {
    if (window.Shopify && typeof window.Shopify.formatMoney === "function") {
      return window.Shopify.formatMoney(cents, window.Shopify.money_format || "${{amount}}");
    }
    return "$" + (Number(cents || 0) / 100).toFixed(2);
  }

  function stripHtml(value) {
    var div = document.createElement("div");
    div.innerHTML = value || "";
    return (div.textContent || div.innerText || "").trim();
  }

  function getProduct(handle) {
    return fetch("/products/" + handle + ".js").then(function (res) {
      if (!res.ok) throw new Error("Could not load product");
      return res.json();
    });
  }

  function variantMatchesSelections(variant, selections) {
    var keys = ["option1", "option2", "option3"];
    return keys.every(function (key, index) {
      if (!selections[index]) return true;
      return variant[key] === selections[index];
    });
  }

  function getSelectedOptions() {
    return Array.prototype.map.call(
      popupOptions.querySelectorAll("select[data-option-index]"),
      function (select) {
        return select.value;
      }
    );
  }

  function updateVariantFromSelections() {
    if (!currentProduct) return;
    var selections = getSelectedOptions();
    currentVariant = currentProduct.variants.find(function (variant) {
      return variantMatchesSelections(variant, selections);
    });

    if (!currentVariant) currentVariant = currentProduct.variants[0];

    popupPrice.textContent = formatMoney(currentVariant.price);
    popupAddToCart.disabled = !currentVariant.available;
    popupAddToCart.textContent = currentVariant.available ? "ADD TO CART" : "SOLD OUT";
  }

  function renderOptions(product) {
    popupOptions.innerHTML = "";

    product.options.forEach(function (optionName, index) {
      var values = [];

      product.variants.forEach(function (variant) {
        var optionValue = variant["option" + (index + 1)];
        if (values.indexOf(optionValue) === -1) values.push(optionValue);
      });

      var wrap = document.createElement("div");
      wrap.className = "hiring-test-popup__option";

      var label = document.createElement("label");
      label.textContent = optionName;
      label.setAttribute("for", "hiring-option-" + index);

      var select = document.createElement("select");
      select.id = "hiring-option-" + index;
      select.setAttribute("data-option-index", String(index));

      values.forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });

      select.addEventListener("change", updateVariantFromSelections);
      wrap.appendChild(label);
      wrap.appendChild(select);
      popupOptions.appendChild(wrap);
    });
  }

  function openPopup(handle) {
    getProduct(handle)
      .then(function (product) {
        currentProduct = product;
        currentVariant = product.variants[0];
        popupTitle.textContent = product.title;
        popupDescription.textContent = stripHtml(product.description).slice(0, 220);
        popupImage.innerHTML = product.images[0]
          ? '<img src="' + product.images[0] + '" alt="' + product.title.replace(/"/g, "&quot;") + '">'
          : "";
        renderOptions(product);
        updateVariantFromSelections();
        popup.classList.add("is-open");
        document.body.style.overflow = "hidden";
      })
      .catch(function () {
        alert("Unable to load product details. Please try again.");
      });
  }

  function closePopup() {
    popup.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function shouldAddBonusVariant(variant) {
    if (!variant) return false;
    var options = [variant.option1, variant.option2, variant.option3]
      .filter(Boolean)
      .map(function (v) {
        return String(v).toLowerCase();
      });
    return options.indexOf("black") !== -1 && options.indexOf("medium") !== -1;
  }

  function addItemsToCart(items) {
    return fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items: items }),
    }).then(function (res) {
      if (!res.ok) throw new Error("Add to cart failed");
      return res.json();
    });
  }

  popupForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!currentVariant) return;

    var items = [{ id: currentVariant.id, quantity: 1 }];
    var maybeAddBonus = shouldAddBonusVariant(currentVariant);

    var promise = Promise.resolve();
    if (maybeAddBonus && bonusHandle) {
      promise = getProduct(bonusHandle)
        .then(function (bonusProduct) {
          var firstAvailable = bonusProduct.variants.find(function (v) {
            return v.available;
          });
          if (firstAvailable) items.push({ id: firstAvailable.id, quantity: 1 });
        })
        .catch(function () {
          return null;
        });
    }

    promise
      .then(function () {
        return addItemsToCart(items);
      })
      .then(function () {
        closePopup();
        window.dispatchEvent(new CustomEvent("cart:refresh"));
      })
      .catch(function () {
        alert("Unable to add product to cart. Please retry.");
      });
  });

  document.addEventListener("click", function (event) {
    var opener = event.target.closest("[data-hiring-open-popup]");
    if (opener) {
      event.preventDefault();
      var handle = opener.getAttribute("data-product-handle");
      if (handle) openPopup(handle);
      return;
    }

    if (
      event.target.matches("[data-hiring-popup-close]") ||
      event.target.matches("[data-hiring-popup-overlay]")
    ) {
      closePopup();
    }
  });
})();
