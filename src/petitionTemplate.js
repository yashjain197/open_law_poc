// src/petitionTemplate.js
export const PETITION_TITLE = "Public Petition";

export const PETITION_TEMPLATE = `
# **[[Petition Title: Text]]**

**Petitioner:** [[Petitioner Name: Text]]  
**Petitioner Email:** [[Petitioner Email: Identity | Signature]]  
**Petitioner Wallet:** [[Petitioner Wallet: EthAddress]]  
**Date:** [[Filing Date: Date]]

**Recipient / Authority:** [[Recipient Name: Text]]

---

## Statement
[[Petition Body: LargeText]]

## Requested Action
[[Requested Action: LargeText]]

## Public Display
The Petitioner agrees that this petition may be displayed publicly. [[Allow Public Display: YesNo]]

---

**Signature of Petitioner**  
Wallet: [[Petitioner Wallet]]  
Email Identity: [[Petitioner Email]]  
__________________________  
[[Petitioner Name]]
`;
