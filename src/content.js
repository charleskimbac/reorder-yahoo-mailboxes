// clear for testing
// chrome.storage.sync.remove("addresses");
// chrome.storage.sync.remove("sortByUnread");

let mailboxUlElements = document.querySelectorAll(".M_0.P_0.hd_n"); // class "M_0 P_0 hd_n"
let mailboxULelement = Array.from(mailboxUlElements)[0]; // first ul elem of this class; this elem is replaced by a newer elem sometimes, need to get it again
let mailboxLiElements = Array.from(mailboxULelement.children); // li elems (mailboxes)
const addressToLiElement = {}; // address: li element

main();
async function main() {
    // KNOWN BUG: WHEN EXT DOESNT WORK/LOAD THE SORT, SCROLL DOWN MAILBOX LIST. IT GETS DUPED!
    // mailboxULelement and mailboxLiElements are removed and replaced SO WE NEED TO TRACK ALL DOC CHANGES 
    // USING MUTATION OBSERVER TO MAKE SURE WE ARE USING LATEST ONE AND NOT THE ONE THAT WAS REPLACED!! YIPEEEEEEE
    // todo: on replaced, remove all elems in old observer and refs, and redo all logic
    await new Promise((resolve) => { // wait to maybe ensure we get the last replacement (temp fix)
        window.setTimeout(resolve, 300);
    });

    const onNewUI = isOnNewUI();
    if (onNewUI) {
        return;
    }

    // load saved order
    const storedAddresses = await chrome.storage.sync.get("addresses"); // obj
    const addressOrder = storedAddresses && storedAddresses.addresses;

    if (addressOrder) { // if has stored order
        // console.log("RYM-ULelement:", mailboxULelement);
        addressOrder.forEach((address) => {
            while (!mailboxULelement.isConnected) { // got replaced, not in DOM
                console.log("RYM-ULelement not connected:", mailboxULelement);
                mailboxUlElements = document.querySelectorAll(".M_0.P_0.hd_n");
                mailboxULelement = Array.from(mailboxUlElements)[0];
            }
            console.log("RYM-ULelement connected:", mailboxULelement, address);

            const liElement = mailboxLiElements.find((li) => { // find li element corresp. with address
                return li.children[0].getAttribute("data-test-account-email") === address;
            });
            console.log("RYM-liElement:", liElement);
            addressToLiElement[address] = liElement;

            mailboxULelement.appendChild(liElement); // start showing new order
        });
        mailboxLiElements = Array.from(mailboxULelement.children); // update changes
        console.log("RYM-loaded order:", mailboxLiElements);
    } else {
        mailboxLiElements.forEach((li) => {
            const address = li.children[0].getAttribute("data-test-account-email");
            addressToLiElement[address] = li;
        });
    }

    // set sort by unread
    const response = await storageSyncGet("sortByUnread");
    if (!response) {
        chrome.storage.sync.set({"sortByUnread": false});
    } else if (response.sortByUnread) {
        window.addEventListener("locationchange", onLocationChange);
        setSortByUnread(); // on initial load
    }

    function onLocationChange() {
        // check if current page is a mailbox (eg not in a specific email or search). eg: https://mail.yahoo.com/d/folders/[a number] ... nothing after
        const url = location.href;
        const rootUrl = "https://mail.yahoo.com/d/folders/";
        if (url.startsWith(rootUrl)) {
            const after = url.substring(rootUrl.length);
            if (after.includes("/")) { // mailbox page shouldnt have / after root
                return;
            }
            setSortByUnread();
        }
    }

    setListeners();
}

function isOnNewUI() {
    return location.href.includes("/n/"); // new UI format: "mail.yahoo.com/n/folders/[mailboxNumber]"; old: "mail.yahoo.com/d/folders/[mailboxNumber]"
}

function setListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendRequest) => {
        if (message.task === "getAddresses") {
            sendRequest(Object.keys(addressToLiElement));
            // console.log("RYM-sent:", addressToLiElement);
        } else if (message.task === "updateAddresses") {
            // active=from over=to
            const activeIndex = message.activeIndex;
            const overIndex = message.overIndex;
            
            if (activeIndex > overIndex) {
                mailboxULelement.insertBefore(mailboxLiElements[activeIndex], mailboxLiElements[overIndex]);
            } else {
                mailboxULelement.insertBefore(mailboxLiElements[activeIndex], mailboxLiElements[overIndex].nextSibling);
            }
            
            mailboxLiElements = Array.from(mailboxULelement.children); // update changes
            console.log("RYM-updated order:", mailboxLiElements);
        } else if (message.task === "sortByUnread") {
            if (message.sortByUnread) {
                window.addEventListener("locationchange", onLocationChange);
                setSortByUnread(); // on initial load
            } else {
                window.removeEventListener("locationchange", onLocationChange);
            }
        // } else if (message.task === "optOutNewUI") {
        //     const optOutButton = document.querySelectorAll(".r_P.e_Z1pAdC9.A_6EGz.fd_N.u_e69.i_3ngpV.D_X.ab_C.gl_C.k_w.j4_n.lv4_2k4xdS.j0_1mc63A.H_72FG.P_r9KQe.q_ZiTj5d.b_dm5.C_sfJow.b4_dm5.q4_WEuPY.b0_Z2utlOw.q0_Z25M4so.p_R.Q_6Fd5.E_1DQFzi.y_1TqRq5.dq34_hP.p34_a.e34_Z1pAdC9.T34_0.L34_0.W34_6D6F.H34_6D6F.q34_wzKXL.O34_Z20hJ4G.h34_1DdG6g.lt34_C.ly34_2msHci.lx34_ZPrgjW.lz34_ZaEH55.C4_1GbO8e.ly36_2msHci.lx36_jhDhM.O36_1grVag.h36_Z1ihKFs.lt36_C.h38_a3DRd.lt38_C.ly38_1f1FRF.lx38_jhDhM.lz38_ZaEH55.I_ZprBTp")[0];
        //     optOutButton.click();
        //     const skipButton = document.querySelectorAll(".r_P.e_Z1mIQBG.A_6EGz.fd_N.u_e69.i_N.D_F.ab_C.gl_C.k_w.j4_1mc63A.lv4_Zz9dWH.j0_1mc63A.H_72FG.P_ODIwj.q_Z2c8wkG.b_n.C_Z1LGdeL.q4_Z2d7yvo.q0_Z2nG8r9")[0];
        //     skipButton.click();
        } else {
            throw new Error("Unknown task");
        }
    });
}

async function setSortByUnread() {
    // click unread button after sortby is clicked (observer to wait for button to open)
    // start observing before clicking sortby

    const sortByButtonQuery = "button[data-test-id='toolbar-sort-menu-button']";
    let sortByButton = document.querySelector(sortByButtonQuery);
    if (sortByButton) { // if already loaded, sometimes not loaded if just exiting an email
        sortByButton.click();
        clickUnread();
    } else {
        sortByButton = await waitForElement(sortByButtonQuery);
        sortByButton.click();
        clickUnread();
    }

    async function clickUnread() {
        const unreadButtonQuery = "button[data-test-id='sort-by-unread']";
        let unreadButton = document.querySelector(unreadButtonQuery);

        if (unreadButton) {
            unreadButton.click();
        } else {
            unreadButton = await waitForElement(unreadButtonQuery);
            unreadButton.click();
        }
    }
}

// from FirefoxMV2WebAPIChromeNamespace.js
// keys = string or string[]
// no stored data found: in chrome- returns empty object; in FF- returns undefined
// BUT here, null will be returned if no stored data found
async function storageSyncGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(keys, (response) => {
            if (response === undefined || Object.keys(response).length === 0) {
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}

// from WaitForElement.js
// wait for an element to appear in the DOM, or return it if already present. 
// selector: query string, parent: Node
async function waitForElement(selector, parent) {
    if (!parent) {
        parent = document.body;
    }
    
    const element = parent.querySelector(selector);
    if (element) {
        return element;
    }

    return new Promise((resolve) => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(() => {
                const element = parent.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });
        });
        observer.observe(parent, {childList: true, subtree: true});
    });
}