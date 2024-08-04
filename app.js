const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const databasePath = path.join(__dirname, 'covid19IndiaPortal.db')

const app = express()

app.use(express.json())
let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log(`Server Running at http://localhost:3000/`),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const convertState = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrict = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

function authenticationToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)
  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticationToken, async (request, response) => {
  const getStateQuery = `
                SELECT 
                *
                FROM
                state;`
  const stateArray = await database.all(getStateQuery)
  response.send(stateArray.map(eachState => convertState(eachState)))
})

app.get('/states/:stateId/', authenticationToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
                SELECT 
                *
                FROM 
                state
                WHERE 
                state_id = ${stateId}`
  const state = await database.get(getStateQuery)
  response.send(convertState(state))
})

app.post('/districts/', authenticationToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const getStateQuery = `
                INSERT INTO
                district (state_id, district_name, cases, cured, active, deaths)
                VALUES (
                    ${stateId},
                    '${districtName}',
                    ${cases},
                    ${cured},
                    ${active},
                    ${deaths}
                );`
  await database.run(getStateQuery)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const getStateQuery = `
                SELECT 
                *
                FROM 
                district
                WHERE 
                district_id = '${districtId}'`
    const state = await database.get(getStateQuery)
    response.send(convertDistrict(state))
  },
)

app.delete(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const getStateQuery = `
                DELETE FROM
                district
                WHERE 
                district_id = '${districtId}';`
    await database.run(getStateQuery)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId/',
  authenticationToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const getStateQuery = `
                UPDATE 
                district
                SET 
                    district_name = '${districtName}',
                    state_id = ${stateId},
                    cases = ${cases},
                    cured = ${cured},
                    active = ${active},
                    deaths = ${deaths}
                WHERE 
                district_id = ${districtId}`
    await database.run(getStateQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticationToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateQuery = `
  SELECT
  SUM(cases),
  SUM(cured),
  SUM(active),
  SUM(deaths)
  FROM
  district
  WHERE state_id = ${stateId};`
    const stats = await database.get(getStateQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

module.exports = app
