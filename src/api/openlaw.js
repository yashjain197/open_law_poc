// api/openlaw.js
import { APIClient } from "openlaw";
import { extractCreatorIdFromLoginResponse } from "../utils/auth.js";

const ROOT = "https://lib.openlaw.io/api/v1/default";
const apiClient = new APIClient(ROOT);

export async function loginAndGetCreatorId(email, password) {
  const res = await apiClient.login(email, password);
  return extractCreatorIdFromLoginResponse(res);
}

function makeIdentityString({ id, email }) {
  return JSON.stringify({
    id: { id },
    email,
    identifiers: [{ identityProviderId: "openlaw", identifier: email }],
  });
}

export async function createPetitionContract({
  userEmail,           // petitioner's email (also your logged-in user)
  userPassword,        // for login
  petitionValues,      // your form values
  templateText,        // your Petition template text (OpenLaw markup)
  templateTitle = "Public Petition",
}) {
  const creatorId = await loginAndGetCreatorId(userEmail, userPassword);

  const params = {
    title: templateTitle,
    text: templateText,
    creator: creatorId, // REQUIRED
    parameters: {
      "Petition Title": petitionValues.title,
      "Petitioner Name": petitionValues.name,
      // Identity MUST be a JSON STRING, not a raw object:
      "Petitioner Email": makeIdentityString({ id: creatorId, email: userEmail }),
      "Filing Date": String(petitionValues.filingDateMs),          // epoch ms as string
      "Recipient Name": petitionValues.recipient,
      "Petition Body": petitionValues.body,
      "Requested Action": petitionValues.requestedAction,
      "Allow Public Display": petitionValues.allowPublic ? "true" : "false", // YesNo accepts "true"/"false" strings
    },
    overriddenParagraphs: {},
    agreements: {},
    readonlyEmails: [],
    editEmails: [],
    // draftId: optional
  };

  // If you prefer the raw REST call, remember content-type must be text/plain;charset=UTF-8.
  // But the APIClient handles that for you:
  const result = await apiClient.uploadContract(params);
  return result;
}
